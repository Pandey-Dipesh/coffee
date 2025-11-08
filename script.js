// Google Sheets Integration
const sheetDBUrl = 'https://sheetdb.io/api/v1/x04czwuq20aji';
const isSheetDBEnabled = true; // Enable Google Sheets integration

// Order management variables
let currentProduct = '';
let currentPrice = 0;
let currentQuantity = 1;
let currentWeight = 250; // Default weight in grams

// DOM elements
const loadingScreen = document.getElementById('loadingScreen');
const mainHeader = document.getElementById('mainHeader');
const mainHero = document.getElementById('mainHero');
const productsSection = document.querySelector('.products-section');
const coffeeQuote = document.querySelector('.coffee-quote');
const brewingTips = document.querySelector('.brewing-tips-section');
const orderModal = document.getElementById('orderModal');
const closeModal = document.getElementById('closeModal');
const productNameEl = document.getElementById('productName');
const quantityDisplay = document.getElementById('quantityDisplay');
const decreaseQty = document.getElementById('decreaseQty');
const increaseQty = document.getElementById('increaseQty');
const submitOrder = document.getElementById('submitOrder');
const orderForm = document.getElementById('orderForm');
const toast = document.getElementById('toast');
const weightBtns = document.querySelectorAll('.weight-btn');

// Initialize page with loading animation
window.addEventListener('load', () => {
  setTimeout(() => {
    loadingScreen.classList.add('hidden');
    
    // Show header with animation
    setTimeout(() => {
      mainHeader.classList.add('visible');
    }, 100);
    
    // Show hero section with animation
    setTimeout(() => {
      mainHero.classList.add('visible');
    }, 300);
    
    // Show products section with animation when scrolled into view
    const observerOptions = {
      root: null,
      rootMargin: '0px',
      threshold: 0.1
    };
    
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
        }
      });
    }, observerOptions);
    
    observer.observe(productsSection);
    observer.observe(coffeeQuote);
    observer.observe(brewingTips);
  }, 2000); // Simulate loading time
});

// Product card interactions
document.querySelectorAll('.product-card').forEach(card => {
  // For touch devices - flip on tap
  card.addEventListener('touchstart', function(e) {
    // Only flip if not tapping a button
    if (!e.target.closest('.shop-btn') && !e.target.closest('.flip-indicator')) {
      this.classList.toggle('touched');
    }
  });
  
  // For desktop - flip on click of indicator
  card.querySelector('.flip-indicator').addEventListener('click', function(e) {
    e.stopPropagation();
    card.classList.toggle('flipped');
  });
});

// Weight selection functionality
document.querySelectorAll('.weight-option').forEach(option => {
  option.addEventListener('click', function() {
    const weightContainer = this.closest('.weight-info');
    weightContainer.querySelectorAll('.weight-option').forEach(opt => {
      opt.classList.remove('active');
    });
    this.classList.add('active');
  });
});

// Weight selection in modal
weightBtns.forEach(btn => {
  btn.addEventListener('click', function() {
    // Remove active class from all weight buttons
    weightBtns.forEach(b => b.classList.remove('active'));
    // Add active class to clicked button
    this.classList.add('active');
    // Update current weight
    currentWeight = parseInt(this.dataset.weight);
  });
});

// Product buttons (both front and back)
document.querySelectorAll('.shop-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    currentProduct = btn.dataset.name;
    currentPrice = parseFloat(btn.dataset.price);
    currentQuantity = 1;
    currentWeight = 250; // Reset to default weight
    quantityDisplay.textContent = currentQuantity;
    
    // Reset weight buttons in modal
    weightBtns.forEach(b => b.classList.remove('active'));
    // Set 250g as active by default
    document.querySelector('.weight-btn[data-weight="250"]').classList.add('active');
    
    // Update modal header with product info
    productNameEl.textContent = `Order ${currentProduct} - $${currentPrice}`;
    
    // Show modal
    orderModal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  });
});

// Close modal
closeModal.addEventListener('click', () => {
  orderModal.style.display = 'none';
  document.body.style.overflow = 'auto';
});

// Close modal when clicking outside
window.addEventListener('click', (e) => {
  if (e.target === orderModal) {
    orderModal.style.display = 'none';
    document.body.style.overflow = 'auto';
  }
});

// Quantity controls
decreaseQty.addEventListener('click', () => {
  if (currentQuantity > 1) {
    currentQuantity--;
    quantityDisplay.textContent = currentQuantity;
  }
});

increaseQty.addEventListener('click', () => {
  currentQuantity++;
  quantityDisplay.textContent = currentQuantity;
});

// Form submission
orderForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  // Get form values
  const name = document.getElementById('customerName').value.trim();
  const phone = document.getElementById('customerPhone').value.trim();
  const location = document.getElementById('customerLocation').value.trim();
  const email = document.getElementById('customerEmail').value.trim();
  const transactionId = document.getElementById('transactionId').value.trim();

  // Validate required fields
  if (!name || !phone || !location || !email) {
    showToast('Please fill in all required fields', 'error');
    return;
  }

  // Show loading state
  const originalText = submitOrder.textContent;
  submitOrder.classList.add('loading');
  submitOrder.disabled = true;

  // Submit to Google Sheets if enabled
  if (isSheetDBEnabled) {
    // Prepare payload for Google Sheets - INCLUDING weightDisplay
    const payload = {
      data: {
        customerName: name,
        customerPhone: phone,
        customerLocation: location,
        quantityDisplay: currentQuantity.toString(),
        customerEmail: email,
        coustomerUpload: transactionId || 'No transaction ID provided',
        weightDisplay: `${currentWeight}g`, // ADDED THIS LINE
        productName: currentProduct,
        price: currentPrice.toString(),
        weight: `${currentWeight}g`,
        totalAmount: (currentPrice * currentQuantity).toFixed(2),
        orderDate: new Date().toLocaleDateString(),
        timestamp: new Date().toISOString(),
        status: 'Pending Payment Verification'
      }
    };

    console.log('Sending payload to SheetDB:', payload);

    try {
      const response = await fetch(sheetDBUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('SheetDB API Error:', errorText);
        throw new Error(`API Error: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      console.log('Order submitted successfully:', result);
      
      // Show success message
      showToast('Order submitted successfully! We will verify your payment and contact you soon.', 'success');
      
      // Reset form and close modal
      orderModal.style.display = 'none';
      orderForm.reset();
      document.body.style.overflow = 'auto';
      
    } catch (error) {
      console.error('Submission error:', error);
      showToast('Error submitting order. Please try again or contact support.', 'error');
    } finally {
      // Reset button state
      submitOrder.classList.remove('loading');
      submitOrder.disabled = false;
      submitOrder.textContent = originalText;
    }
  } else {
    // Demo mode - simulate successful order
    setTimeout(() => {
      const totalAmount = (currentPrice * currentQuantity).toFixed(2);
      
      console.log('Demo Order Details:', {
        customerName: name,
        customerPhone: phone,
        customerLocation: location,
        quantityDisplay: currentQuantity,
        customerEmail: email,
        weightDisplay: `${currentWeight}g`, // ADDED THIS LINE
        productName: currentProduct,
        price: currentPrice,
        weight: `${currentWeight}g`,
        totalAmount: totalAmount,
        transactionId: transactionId
      });

      showToast(`Demo: Order for ${currentProduct} (Qty: ${currentQuantity}, Weight: ${currentWeight}g) submitted successfully! Total: $${totalAmount}`, 'success');
      
      // Reset form and close modal
      orderModal.style.display = 'none';
      orderForm.reset();
      document.body.style.overflow = 'auto';

      // Reset button state
      submitOrder.classList.remove('loading');
      submitOrder.disabled = false;
    }, 1500);
  }
});

// Toast notification function
function showToast(message, type = 'success') {
  toast.textContent = message;
  toast.className = '';
  if (type === 'error') {
    toast.classList.add('error');
  } else if (type === 'warning') {
    toast.classList.add('warning');
  }
  toast.style.display = 'block';
  
  setTimeout(() => {
    toast.style.display = 'none';
  }, 5000);
}

// Hero buttons functionality
document.querySelectorAll('.hero-btns .btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    if (btn.textContent.includes('Shop Now')) {
      e.preventDefault();
      document.querySelector('#products').scrollIntoView({
        behavior: 'smooth'
      });
    } else if (btn.textContent.includes('Brewing Tips')) {
      e.preventDefault();
      document.querySelector('#brewing-tips').scrollIntoView({
        behavior: 'smooth'
      });
    }
  });
});

// Add console info for debugging
console.log('Keshari Coffee Shop - SheetDB Integration Active');
console.log('Google Sheet Columns Detected:');
console.log('- customerName');
console.log('- customerPhone');
console.log('- customerLocation');
console.log('- quantityDisplay');
console.log('- customerEmail');
console.log('- coustomerUpload (now used for transaction ID)');
console.log('- weightDisplay'); // ADDED THIS LINE